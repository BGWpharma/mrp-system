import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Button,
  Paper,
  Chip,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  LinearProgress
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import InventoryIcon from '@mui/icons-material/Inventory';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { useNavigate } from 'react-router-dom';
// Status constants are used inline
import { useNotification } from '../../../../hooks/useNotification';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const RECEIVABLE_STATUSES = ['ordered', 'confirmed', 'shipped', 'delivered', 'partial'];

const POModalReceivingTab = ({ purchaseOrder, orderId, unloadingFormResponses, onRefresh }) => {
  const navigate = useNavigate();
  const { showError } = useNotification();
  const [activeStep, setActiveStep] = useState(0);

  const po = purchaseOrder;
  const items = useMemo(() => po?.items || [], [po?.items]);

  const canReceive = RECEIVABLE_STATUSES.includes(po?.status);

  const hasUnloadingReports = unloadingFormResponses && unloadingFormResponses.length > 0;

  const isItemInUnloadingForms = useCallback((item) => {
    if (!unloadingFormResponses || unloadingFormResponses.length === 0) return false;
    for (const response of unloadingFormResponses) {
      if (!response.selectedItems) continue;
      for (const selectedItem of response.selectedItems) {
        if (selectedItem.poItemId === item.id) return true;
        if (selectedItem.id === item.id) return true;
      }
    }
    return false;
  }, [unloadingFormResponses]);

  const getExpiryInfoFromUnloadingForms = useCallback((item) => {
    const allBatches = [];
    let reportsCount = 0;
    if (!unloadingFormResponses) return { batches: [], reportsCount: 0 };

    for (const response of unloadingFormResponses) {
      if (!response.selectedItems) continue;
      const matchedItem = response.selectedItems.find(
        si => si.poItemId === item.id || si.id === item.id
      );
      if (matchedItem?.batches?.length > 0) {
        reportsCount++;
        allBatches.push(...matchedItem.batches);
      }
    }
    return { batches: allBatches, reportsCount };
  }, [unloadingFormResponses]);

  const itemsVerification = useMemo(() => {
    return items.map(item => {
      const inUnloading = isItemInUnloadingForms(item);
      const expiryInfo = getExpiryInfoFromUnloadingForms(item);
      const qty = Number(item.quantity) || 0;
      const received = Number(item.received) || 0;
      const needsReceiving = received < qty;
      const fullyReceived = qty > 0 && received >= qty;

      return {
        ...item,
        inUnloading,
        expiryInfo,
        needsReceiving,
        fullyReceived,
        received,
        qty,
        batchCount: expiryInfo.batches.length
      };
    });
  }, [items, isItemInUnloadingForms, getExpiryInfoFromUnloadingForms]);

  const verificationSummary = useMemo(() => {
    const total = itemsVerification.length;
    const verified = itemsVerification.filter(i => i.inUnloading).length;
    const fullyReceived = itemsVerification.filter(i => i.fullyReceived).length;
    const pendingReceiving = itemsVerification.filter(i => i.needsReceiving && i.inUnloading).length;
    return { total, verified, fullyReceived, pendingReceiving };
  }, [itemsVerification]);

  const handleReceiveItem = (item) => {
    if (!item.inventoryItemId) {
      showError(`Pozycja "${item.name}" nie jest powiązana z produktem w magazynie`);
      return;
    }

    if (!isItemInUnloadingForms(item)) {
      showError(`Pozycja "${item.name}" nie została zgłoszona w raporcie rozładunku`);
      return;
    }

    const unitPrice = typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(item.unitPrice || 0);
    const expiryInfo = getExpiryInfoFromUnloadingForms(item);

    const queryParams = new URLSearchParams();
    queryParams.append('poNumber', po.number);
    queryParams.append('orderId', orderId);

    let totalQuantity = item.quantity;
    if (expiryInfo.batches?.length > 0) {
      const batchesSum = expiryInfo.batches.reduce((sum, b) => sum + parseFloat(b.unloadedQuantity || 0), 0);
      if (batchesSum > 0) totalQuantity = batchesSum;
    }
    queryParams.append('quantity', totalQuantity);
    queryParams.append('unitPrice', unitPrice);
    queryParams.append('reason', 'purchase');
    queryParams.append('source', 'purchase');
    queryParams.append('sourceId', orderId);

    if (item.id) queryParams.append('itemPOId', item.id);
    if (item.name) queryParams.append('itemName', item.name);
    queryParams.append('reference', po.number);
    queryParams.append('returnTo', `/purchase-orders/${orderId}`);

    if (expiryInfo.batches?.length > 0) {
      const batchesToPass = expiryInfo.batches.map(b => ({
        batchNumber: b.batchNumber || '',
        quantity: b.unloadedQuantity || '',
        expiryDate: b.expiryDate instanceof Date ? b.expiryDate.toISOString() : (b.expiryDate || null),
        noExpiryDate: b.noExpiryDate || false
      }));
      queryParams.append('batches', JSON.stringify(batchesToPass));
    }

    localStorage.setItem('refreshPurchaseOrder', orderId);
    navigate(`/inventory/${item.inventoryItemId}/receive?${queryParams.toString()}`);
  };

  const handleOpenUnloadingForm = () => {
    navigate('/inventory/forms/unloading-report');
  };

  return (
    <Box sx={{ p: 3 }}>
      {!canReceive && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Przyjmowanie towaru jest dostępne tylko dla zamówień o statusie: Zamówione, Potwierdzone, Wysłane, Dostarczone lub Częściowo dostarczone.
        </Alert>
      )}

      <Stepper activeStep={activeStep} orientation="vertical">
        {/* ETAP 1: Protokół rozładunku */}
        <Step completed={hasUnloadingReports}>
          <StepLabel
            StepIconProps={{ sx: { color: hasUnloadingReports ? 'success.main' : undefined } }}
            onClick={() => setActiveStep(0)}
            sx={{ cursor: 'pointer' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AssignmentIcon sx={{ fontSize: 20 }} />
              <Typography variant="subtitle2">Protokół rozładunku</Typography>
              {hasUnloadingReports ? (
                <Chip label={`${unloadingFormResponses.length} raport(ów)`} size="small" color="success" variant="outlined" sx={{ height: 22 }} />
              ) : (
                <Chip label="Brak" size="small" color="warning" variant="outlined" sx={{ height: 22 }} />
              )}
            </Box>
          </StepLabel>
          <StepContent>
            {hasUnloadingReports ? (
              <Box>
                {unloadingFormResponses.map((report, idx) => (
                  <Paper key={report.id} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          Raport #{idx + 1}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {report.fillDate ? format(report.fillDate, 'dd.MM.yyyy HH:mm', { locale: pl }) : 'Brak daty'}
                          {report.employee && ` — ${report.employee}`}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Chip
                          label={`${report.selectedItems?.length || 0} pozycji`}
                          size="small"
                          variant="outlined"
                          sx={{ height: 22 }}
                        />
                        <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                      </Box>
                    </Box>
                  </Paper>
                ))}
                <Button size="small" variant="text" onClick={() => setActiveStep(1)} sx={{ mt: 1 }}>
                  Dalej: Weryfikacja
                </Button>
              </Box>
            ) : (
              <Box>
                <Alert severity="warning" sx={{ mb: 1.5 }}>
                  Przed przyjęciem towaru należy wypełnić protokół rozładunku.
                </Alert>
                <Button
                  variant="outlined"
                  startIcon={<OpenInNewIcon />}
                  onClick={handleOpenUnloadingForm}
                  size="small"
                >
                  Wypełnij protokół rozładunku
                </Button>
              </Box>
            )}
          </StepContent>
        </Step>

        {/* ETAP 2: Weryfikacja */}
        <Step completed={verificationSummary.verified === verificationSummary.total && verificationSummary.total > 0}>
          <StepLabel
            onClick={() => setActiveStep(1)}
            sx={{ cursor: 'pointer' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LocalShippingIcon sx={{ fontSize: 20 }} />
              <Typography variant="subtitle2">Weryfikacja towaru</Typography>
              <Chip
                label={`${verificationSummary.verified}/${verificationSummary.total}`}
                size="small"
                color={verificationSummary.verified === verificationSummary.total && verificationSummary.total > 0 ? 'success' : 'default'}
                variant="outlined"
                sx={{ height: 22 }}
              />
            </Box>
          </StepLabel>
          <StepContent>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ py: 0.5 }}>Status</TableCell>
                  <TableCell sx={{ py: 0.5 }}>Pozycja</TableCell>
                  <TableCell align="right" sx={{ py: 0.5 }}>Zamówiono</TableCell>
                  <TableCell align="right" sx={{ py: 0.5 }}>W raporcie</TableCell>
                  <TableCell align="right" sx={{ py: 0.5 }}>Przyjęto</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {itemsVerification.map((item, idx) => (
                  <TableRow key={item.id || idx}>
                    <TableCell sx={{ py: 0.5 }}>
                      {item.fullyReceived ? (
                        <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main' }} />
                      ) : item.inUnloading ? (
                        <CheckCircleIcon sx={{ fontSize: 18, color: 'info.main' }} />
                      ) : (
                        <ErrorIcon sx={{ fontSize: 18, color: 'error.main' }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ py: 0.5 }}>
                      <Typography variant="body2">{item.name}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.5 }}>
                      <Typography variant="body2">{item.qty} {item.unit || 'szt'}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.5 }}>
                      <Typography variant="body2" color={item.inUnloading ? 'success.main' : 'error.main'}>
                        {item.batchCount > 0 ? `${item.batchCount} partii` : (item.inUnloading ? 'Tak' : 'Nie')}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.5 }}>
                      <Typography variant="body2">{item.received}/{item.qty}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button size="small" variant="text" onClick={() => setActiveStep(2)} sx={{ mt: 1 }}>
              Dalej: Przyjęcie na magazyn
            </Button>
          </StepContent>
        </Step>

        {/* ETAP 3: Przyjęcie na magazyn */}
        <Step completed={verificationSummary.fullyReceived === verificationSummary.total && verificationSummary.total > 0}>
          <StepLabel
            onClick={() => setActiveStep(2)}
            sx={{ cursor: 'pointer' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <InventoryIcon sx={{ fontSize: 20 }} />
              <Typography variant="subtitle2">Przyjęcie na magazyn</Typography>
              <Chip
                label={`${verificationSummary.fullyReceived}/${verificationSummary.total}`}
                size="small"
                color={verificationSummary.fullyReceived === verificationSummary.total && verificationSummary.total > 0 ? 'success' : 'default'}
                variant="outlined"
                sx={{ height: 22 }}
              />
            </Box>
          </StepLabel>
          <StepContent>
            {itemsVerification.filter(i => !i.fullyReceived).length === 0 ? (
              <Alert severity="success" sx={{ mb: 1.5 }}>
                Wszystkie pozycje zostały w pełni przyjęte na magazyn.
              </Alert>
            ) : (
              <Box>
                {itemsVerification.map((item, idx) => {
                  if (item.fullyReceived) return null;
                  const progress = item.qty > 0 ? Math.round((item.received / item.qty) * 100) : 0;

                  return (
                    <Paper key={item.id || idx} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{item.name}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            {item.received}/{item.qty} {item.unit || 'szt'}
                          </Typography>
                          <Button
                            variant="contained"
                            size="small"
                            disabled={!canReceive || !item.inUnloading || !item.inventoryItemId}
                            onClick={() => handleReceiveItem(item)}
                            sx={{ minWidth: 'auto', fontSize: '0.75rem', textTransform: 'none' }}
                          >
                            Przyjmij
                          </Button>
                        </Box>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={progress}
                        sx={{ height: 4, borderRadius: 2 }}
                      />
                      {!item.inUnloading && (
                        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                          Wymaga raportu rozładunku
                        </Typography>
                      )}
                      {!item.inventoryItemId && (
                        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                          Brak powiązania z produktem magazynowym
                        </Typography>
                      )}
                    </Paper>
                  );
                })}
              </Box>
            )}
          </StepContent>
        </Step>
      </Stepper>
    </Box>
  );
};

export default POModalReceivingTab;
