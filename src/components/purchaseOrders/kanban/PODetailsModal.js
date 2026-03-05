import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Tabs,
  Tab,
  CircularProgress,
  Chip,
  useMediaQuery,
  useTheme
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import { useNavigate } from 'react-router-dom';
import {
  getPurchaseOrderById,
  translateStatus,
  translatePaymentStatus,
  KANBAN_COLUMN_COLORS,
  updatePurchaseOrderStatus
} from '../../../services/purchaseOrders';
import { getBatchesByPurchaseOrderId } from '../../../services/inventory';
import { getInvoicesByOrderId, getReinvoicedAmountsByPOItems } from '../../../services/finance';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';
import { getUsersDisplayNames } from '../../../services/userService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebase/config';
import POModalDetailsTab from './tabs/POModalDetailsTab';
import POModalItemsTab from './tabs/POModalItemsTab';
import POModalReceivingTab from './tabs/POModalReceivingTab';
import POModalDocumentsTab from './tabs/POModalDocumentsTab';

const PODetailsModal = ({ open, orderId, onClose, onSave }) => {
  const { t } = useTranslation('purchaseOrders');
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();

  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchaseOrder, setPurchaseOrder] = useState(null);
  const [relatedBatches, setRelatedBatches] = useState([]);
  const [userNames, setUserNames] = useState({});
  const [unloadingFormResponses, setUnloadingFormResponses] = useState([]);
  const [reinvoicedAmounts, setReinvoicedAmounts] = useState({ items: {}, additionalCosts: {} });

  const fetchData = useCallback(async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      const data = await getPurchaseOrderById(orderId);
      setPurchaseOrder(data);

      if (data.statusHistory?.length > 0) {
        const userIds = [...new Set(data.statusHistory.map(c => c.changedBy).filter(Boolean))];
        const names = await getUsersDisplayNames(userIds);
        setUserNames(names);
      }

      const batches = await getBatchesByPurchaseOrderId(orderId);
      setRelatedBatches(batches);

      try {
        const invoices = await getInvoicesByOrderId(orderId);
        const reinvoiced = await getReinvoicedAmountsByPOItems(orderId, invoices, data);
        setReinvoicedAmounts(reinvoiced);
      } catch (e) {
        console.warn('Nie udało się pobrać danych refakturowania:', e);
      }

      if (data?.number) {
        await fetchUnloadingForms(data.number);
      }
    } catch (err) {
      console.error('Błąd ładowania PO w modalu:', err);
      showError('Błąd ładowania zamówienia: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [orderId, showError]);

  const fetchUnloadingForms = async (poNumber) => {
    try {
      const poVariants = [
        poNumber,
        poNumber.replace('PO-', ''),
        `PO-${poNumber}`
      ].filter((v, i, a) => a.indexOf(v) === i);

      const unloadingQuery = query(
        collection(db, 'Forms/RozladunekTowaru/Odpowiedzi'),
        where('poNumber', 'in', poVariants)
      );
      const snapshot = await getDocs(unloadingQuery);

      const convertDate = (dateValue) => {
        if (!dateValue) return null;
        if (dateValue.toDate && typeof dateValue.toDate === 'function') return dateValue.toDate();
        if (typeof dateValue === 'string') { const p = new Date(dateValue); return isNaN(p.getTime()) ? null : p; }
        if (dateValue instanceof Date) return dateValue;
        return null;
      };

      const responses = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          fillDate: data.fillDate?.toDate(),
          unloadingDate: data.unloadingDate?.toDate(),
          formType: 'unloading',
          selectedItems: data.selectedItems?.map(item => ({
            ...item,
            batches: item.batches?.map(b => ({ ...b, expiryDate: convertDate(b.expiryDate) })) || [],
            expiryDate: convertDate(item.expiryDate)
          })) || []
        };
      });

      responses.sort((a, b) => (b.fillDate || new Date(0)) - (a.fillDate || new Date(0)));
      setUnloadingFormResponses(responses);
    } catch (err) {
      console.error('Błąd pobierania formularzy rozładunku:', err);
      setUnloadingFormResponses([]);
    }
  };

  useEffect(() => {
    if (open && orderId) {
      fetchData();
    }
    return () => {
      if (!open) {
        setActiveTab(0);
        setPurchaseOrder(null);
      }
    };
  }, [open, orderId, fetchData]);

  const handleRefresh = useCallback(async () => {
    await fetchData();
    if (onSave) onSave();
  }, [fetchData, onSave]);

  const handleStatusChange = async (newStatus) => {
    try {
      await updatePurchaseOrderStatus(orderId, newStatus, currentUser?.uid);
      showSuccess('Status zamówienia został zaktualizowany');
      await handleRefresh();
    } catch (err) {
      showError('Błąd zmiany statusu: ' + err.message);
    }
  };

  const handleEdit = () => {
    navigate(`/purchase-orders/${orderId}/edit`);
    onClose();
  };

  const statusColor = purchaseOrder ? (KANBAN_COLUMN_COLORS[purchaseOrder.status] || '#9E9E9E') : '#9E9E9E';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="xl"
      fullWidth
      PaperProps={{
        sx: {
          height: fullScreen ? '100%' : '90vh',
          maxHeight: '90vh'
        }
      }}
    >
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 400 }}>
          <CircularProgress />
        </Box>
      ) : purchaseOrder ? (
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `3px solid ${statusColor}`, pb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
                {purchaseOrder.number}
              </Typography>
              <Chip
                label={translateStatus(purchaseOrder.status)}
                size="small"
                sx={{ bgcolor: statusColor, color: '#fff', fontWeight: 600 }}
              />
              {purchaseOrder.paymentStatus && (
                <Chip
                  label={translatePaymentStatus(purchaseOrder.paymentStatus)}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.75rem' }}
                />
              )}
              {purchaseOrder.supplier?.name && (
                <Typography variant="body2" color="text.secondary">
                  {purchaseOrder.supplier.name}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton size="small" onClick={handleEdit} title="Edytuj">
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={onClose}>
                <CloseIcon />
              </IconButton>
            </Box>
          </DialogTitle>

          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
          >
            <Tab label={t('purchaseOrders.kanban.tabs.details', 'Szczegóły')} />
            <Tab label={t('purchaseOrders.kanban.tabs.items', 'Pozycje')} />
            <Tab label={t('purchaseOrders.kanban.tabs.receiving', 'Przyjęcie')} />
            <Tab label={t('purchaseOrders.kanban.tabs.documents', 'Dokumenty')} />
          </Tabs>

          <DialogContent sx={{ p: 0 }}>
            {activeTab === 0 && (
              <POModalDetailsTab
                purchaseOrder={purchaseOrder}
                userNames={userNames}
                onStatusChange={handleStatusChange}
                onRefresh={handleRefresh}
              />
            )}
            {activeTab === 1 && (
              <POModalItemsTab
                purchaseOrder={purchaseOrder}
                relatedBatches={relatedBatches}
                reinvoicedAmounts={reinvoicedAmounts}
              />
            )}
            {activeTab === 2 && (
              <POModalReceivingTab
                purchaseOrder={purchaseOrder}
                orderId={orderId}
                unloadingFormResponses={unloadingFormResponses}
                onRefresh={handleRefresh}
              />
            )}
            {activeTab === 3 && (
              <POModalDocumentsTab
                purchaseOrder={purchaseOrder}
                orderId={orderId}
                onRefresh={handleRefresh}
              />
            )}
          </DialogContent>
        </>
      ) : (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 400 }}>
          <Typography color="text.secondary">Nie znaleziono zamówienia</Typography>
        </Box>
      )}
    </Dialog>
  );
};

export default PODetailsModal;
