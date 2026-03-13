import React, { useEffect, useState, useMemo } from 'react';
import { Grid, Paper, Typography, Box, Button, Chip, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, IconButton, Collapse, Tooltip, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { 
  ShoppingCart as ShoppingCartIcon,
  Person as PersonIcon,
  ShoppingBasket as ShoppingBasketIcon,
  Schedule as ScheduleIcon,
  Business as BusinessIcon,
  BatchPrediction as BatchIcon,
  EventNote as DateIcon,
  Receipt as ReceiptIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Euro as EuroIcon,
  Link as LinkIcon
} from '@mui/icons-material';
import { formatDateTime } from '../../utils/formatting';
import { useTranslation } from '../../hooks/useTranslation';
import { getWorkstationById } from '../../services/production/workstationService';
import { useNotification } from '../../hooks/useNotification';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';

// Funkcja pomocnicza do dzielenia tablicy na chunki (dla limitu Firestore 'in' = 10)
const chunkArray = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

const TaskDetails = ({ task, hideProductionTime = false }) => {
  const { t } = useTranslation('taskDetails');
  const theme = useTheme();
  const { showError } = useNotification();
  const [workstation, setWorkstation] = useState(null);
  const [relatedBatches, setRelatedBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Stan do śledzenia, które sekcje są zwinięte
  const [expandedSections, setExpandedSections] = useState({
    relatedOrders: true,
    productionTime: true,
    productBatch: true,
    materialBatches: true,
    linkedPurchaseOrders: true
  });
  
  // Funkcja do przełączania stanu zwinięcia/rozwinięcia sekcji
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };
  
  // Sprawdź czy zadanie ma powiązane zamówienie klienta lub zamówienia zakupu
  const hasCustomerOrder = Boolean(task?.orderId);
  const hasPurchaseOrders = Boolean(task?.purchaseOrders && task.purchaseOrders.length > 0);
  const hasLinkedPurchaseOrders = Boolean(task?.linkedPurchaseOrders && task.linkedPurchaseOrders.length > 0);
  
  // Jeśli nie ma żadnych powiązanych zamówień, nie renderuj sekcji dla zamówień
  const hasRelatedOrders = hasCustomerOrder || hasPurchaseOrders || hasLinkedPurchaseOrders;
  
  // Sprawdź czy zadanie ma zdefiniowany LOT lub datę ważności
  const hasProductBatchInfo = Boolean(task?.lotNumber || task?.expiryDate);
  
  // Memoizuj klucze dla stabilnych zależności useEffect
  const materialBatchesKey = useMemo(() => 
    JSON.stringify(task?.materialBatches || {}), 
    [task?.materialBatches]
  );
  
  const consumedMaterialsKey = useMemo(() => 
    JSON.stringify(task?.consumedMaterials || []), 
    [task?.consumedMaterials]
  );
  
  useEffect(() => {
    let cancelled = false;
    const fetchWorkstation = async () => {
      if (task?.workstationId) {
        try {
          const workstationData = await getWorkstationById(task.workstationId);
          if (cancelled) return;
          setWorkstation(workstationData);
        } catch (error) {
          if (cancelled) return;
          console.error('Błąd podczas pobierania stanowiska produkcyjnego:', error);
          showError('Nie udało się pobrać informacji o stanowisku produkcyjnym');
        }
      }
    };
    
    fetchWorkstation();
    return () => { cancelled = true; };
  }, [task?.workstationId, showError]);
  
  useEffect(() => {
    let cancelled = false;
    const fetchRelatedBatches = async () => {
      if (!task?.moNumber) return;
      
      try {
        setLoading(true);
        
        const batchesWithPO = [];
        
        const batchInfoMap = new Map();
        
        if (task.materialBatches) {
          for (const [materialId, batches] of Object.entries(task.materialBatches)) {
            for (const batchInfo of batches) {
              if (batchInfo.batchId && !batchInfoMap.has(batchInfo.batchId)) {
                batchInfoMap.set(batchInfo.batchId, {
                  batchInfo,
                  source: 'reserved'
                });
              }
            }
          }
        }
        
        if (task.consumedMaterials && task.consumedMaterials.length > 0) {
          for (const consumed of task.consumedMaterials) {
            if (consumed.batchId && !batchInfoMap.has(consumed.batchId)) {
              batchInfoMap.set(consumed.batchId, {
                batchInfo: consumed,
                source: 'consumed'
              });
            }
          }
        }
        
        const batchIds = Array.from(batchInfoMap.keys());
        
        if (batchIds.length > 0) {
          const batchChunks = chunkArray(batchIds, 10);
          
          const batchPromises = batchChunks.map(async (chunkIds) => {
            const batchQuery = query(
              collection(db, 'inventoryBatches'),
              where('__name__', 'in', chunkIds)
            );
            const snapshot = await getDocs(batchQuery);
            return snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
          });
          
          const batchResults = await Promise.all(batchPromises);
          if (cancelled) return;
          const allBatches = batchResults.flat();
          
          for (const batchData of allBatches) {
            if (batchData.purchaseOrderDetails) {
              const batchMeta = batchInfoMap.get(batchData.id);
              const batchInfo = batchMeta?.batchInfo || {};
              
              batchesWithPO.push({
                id: batchData.id,
                lotNumber: batchInfo.batchNumber || batchData.lotNumber || batchData.batchNumber,
                quantity: batchInfo.quantity || 0,
                materialName: batchData.itemName || "Materiał",
                purchaseOrderDetails: batchData.purchaseOrderDetails,
                source: batchMeta?.source || 'unknown'
              });
            }
          }
        }
        
        const moQuery = query(
          collection(db, 'inventoryBatches'),
          where('moNumber', '==', task.moNumber)
        );
        
        const moSnapshot = await getDocs(moQuery);
        if (cancelled) return;
        const moBatches = moSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        for (const batch of moBatches) {
          if (batch.purchaseOrderDetails && !batchesWithPO.find(b => b.id === batch.id)) {
            batchesWithPO.push(batch);
          }
        }
        
        setRelatedBatches(batchesWithPO);
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania danych o partiach:', error);
        showError('Nie udało się pobrać informacji o partiach produktów');
        setLoading(false);
      }
    };
    
    fetchRelatedBatches();
    return () => { cancelled = true; };
  }, [task?.moNumber, materialBatchesKey, consumedMaterialsKey, showError]);
  
  const sectionHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    py: 0.5,
    px: 1,
    borderRadius: 1,
    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    '&:hover': {
      bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'
    }
  };

  const relatedOrdersCount = (hasCustomerOrder ? 1 : 0)
    + (task?.purchaseOrders?.length || 0)
    + (task?.linkedPurchaseOrders?.length || 0);
  
  return (
    <>
      <Grid item xs={12}>
        <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
          <Box 
            sx={sectionHeaderStyle}
            onClick={() => toggleSection('relatedOrders')}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShoppingCartIcon color="primary" fontSize="small" />
              <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                {t('sections.relatedOrders')}
              </Typography>
              {relatedOrdersCount > 0 && (
                <Chip label={relatedOrdersCount} size="small" color="primary" variant="outlined" sx={{ height: 22, fontSize: '0.75rem' }} />
              )}
            </Box>
            <IconButton size="small">
              {expandedSections.relatedOrders ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          
          <Collapse in={expandedSections.relatedOrders}>
            {hasCustomerOrder && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'medium' }}>
                  {t('relatedOrders.customerOrder')}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Button
                    variant="outlined"
                    size="small"
                    component={RouterLink}
                    to={`/orders/${task.orderId}`}
                    startIcon={<ShoppingCartIcon />}
                    sx={{ mr: 1 }}
                  >
                    {task.orderNumber || task.orderId}
                  </Button>
                  {task.customer && (
                    <Chip 
                      icon={<PersonIcon />} 
                      label={task.customer.name || 'Klient'}
                      size="small"
                      variant="outlined"
                    />
                  )}
                </Box>
              </Box>
            )}
            
            <Box>
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'medium' }}>
                {t('relatedOrders.relatedPOsWithLots')}
              </Typography>
              {relatedBatches.length > 0 ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  {relatedBatches.map((batch, index) => (
                    <Box 
                      key={batch.id} 
                      sx={{ 
                        border: '1px solid #e0e0e0', 
                        borderRadius: 1, 
                        p: 1.5,
                        minWidth: 200,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.5
                      }}
                    >
                      {/* LOT */}
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <BatchIcon color="info" sx={{ mr: 0.5, fontSize: 18 }} />
                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                          LOT: {batch.lotNumber || batch.batchNumber}
                        </Typography>
                      </Box>
                      
                      {/* PO - jako klikalny link z ikoną */}
                      <Box 
                        component={RouterLink}
                        to={`/purchase-orders/${batch.purchaseOrderDetails.id}`}
                        sx={{ 
                          display: 'flex', 
                          alignItems: 'center',
                          textDecoration: 'none',
                          color: 'primary.main',
                          '&:hover': {
                            textDecoration: 'underline'
                          }
                        }}
                      >
                        <ShoppingBasketIcon sx={{ mr: 0.5, fontSize: 18 }} />
                        <Typography variant="body2">
                          {batch.purchaseOrderDetails.number || '-'}
                        </Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {loading ? 'Ładowanie powiązań...' : 'Brak powiązanych zamówień zakupowych z LOTami'}
                </Typography>
              )}
              
              {(hasPurchaseOrders || hasLinkedPurchaseOrders) && (
                <>
                  <Typography variant="subtitle1" sx={{ mb: 1, mt: 2, fontWeight: 'medium' }}>
                    Inne powiązane zamówienia zakupowe
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {/* Zamówienia automatyczne */}
                    {task.purchaseOrders && task.purchaseOrders.map((po, index) => (
                      <Chip
                        key={`po-${index}`}
                        label={po.number || po.poNumber || po.id}
                        component={RouterLink}
                        to={`/purchase-orders/${po.id}`}
                        clickable
                        icon={<ShoppingBasketIcon />}
                        color="primary"
                        variant="outlined"
                        sx={{ 
                          '&:hover': { 
                            backgroundColor: 'primary.light',
                            color: 'white'
                          }
                        }}
                      />
                    ))}
                    
                    {/* Ręcznie powiązane zamówienia */}
                    {task.linkedPurchaseOrders && task.linkedPurchaseOrders.map((po, index) => (
                      <Chip
                        key={`linked-po-${index}`}
                        label={po.number || po.id}
                        component={RouterLink}
                        to={`/purchase-orders/${po.id}`}
                        clickable
                        icon={<ShoppingBasketIcon />}
                        color="secondary"
                        variant="outlined"
                        sx={{ 
                          '&:hover': { 
                            backgroundColor: 'secondary.light',
                            color: 'white'
                          }
                        }}
                      />
                    ))}
                  </Box>
                </>
              )}
            </Box>
          </Collapse>
        </Paper>
      </Grid>
      
      {!hideProductionTime && task?.scheduledDate && (
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
            <Box 
              sx={sectionHeaderStyle}
              onClick={() => toggleSection('productionTime')}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ScheduleIcon color="primary" fontSize="small" />
                <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                  {t('sections.productionTimeInfo')}
                </Typography>
              </Box>
              <IconButton size="small">
                {expandedSections.productionTime ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
            
            <Collapse in={expandedSections.productionTime}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <ScheduleIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                  {t('productionTimeInfo.scheduledStart')}:
                </Typography>
                <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                  {formatDateTime(task.scheduledDate)}
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <ScheduleIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                  {t('productionTimeInfo.plannedEnd')}:
                </Typography>
                <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                  {formatDateTime(task.endDate)}
                </Typography>
              </Box>
              
              {task.productionTimePerUnit > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                  <ScheduleIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                    {t('productionTimeInfo.timePerUnit')}:
                  </Typography>
                  <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                    {parseFloat(task.productionTimePerUnit).toFixed(2)} {t('productionTimeInfo.minutesPerUnit')}
                  </Typography>
                </Box>
              )}
              
              {task.processingCostPerUnit > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                  <EuroIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                    Koszt procesowy na jednostkę:
                  </Typography>
                  <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                    {parseFloat(task.processingCostPerUnit).toFixed(2)} EUR/szt.
                  </Typography>
                  {task.quantity && (
                    <Typography variant="body2" component="span" sx={{ ml: 2, color: 'text.secondary' }}>
                      (Całkowity: {(parseFloat(task.processingCostPerUnit) * parseFloat(task.quantity)).toFixed(2)} EUR)
                    </Typography>
                  )}
                </Box>
              )}
              
              {task.estimatedDuration > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                  <ScheduleIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                    {t('productionTimeInfo.totalPlannedTime')}:
                  </Typography>
                  <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                    {(task.estimatedDuration / 60).toFixed(2)} {t('productionTimeInfo.hours')}
                  </Typography>
                </Box>
              )}
              
              {/* Informacja o stanowisku produkcyjnym */}
              {workstation && (
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                  <BusinessIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                    {t('productionTimeInfo.workstation')}:
                  </Typography>
                  <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                    {workstation.name}
                    {workstation.location && ` (${t('productionTimeInfo.location')}: ${workstation.location})`}
                  </Typography>
                </Box>
              )}
            </Collapse>
          </Paper>
        </Grid>
      )}
      
      {/* Product batch info is now shown in BasicDataTab */}
      
      {relatedBatches.length > 0 && (
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
            <Box 
              sx={sectionHeaderStyle}
              onClick={() => toggleSection('materialBatches')}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BatchIcon color="primary" fontSize="small" />
                <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                  {t('sections.materialBatches')}
                </Typography>
                <Chip label={relatedBatches.length} size="small" color="info" variant="outlined" sx={{ height: 22, fontSize: '0.75rem' }} />
              </Box>
              <IconButton size="small">
                {expandedSections.materialBatches ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
            
            <Collapse in={expandedSections.materialBatches}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('materialBatches.table.lot')}</TableCell>
                      <TableCell>{t('materialBatches.table.material')}</TableCell>
                      <TableCell align="right">{t('materialBatches.table.quantity')}</TableCell>
                      <TableCell>{t('materialBatches.table.poNumber')}</TableCell>
                      <TableCell>{t('materialBatches.table.supplier')}</TableCell>
                      <TableCell>{t('materialBatches.table.actions')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {relatedBatches.map((batch) => (
                      <TableRow key={batch.id} hover>
                        <TableCell sx={{ fontWeight: 'medium' }}>
                          {batch.lotNumber || t('materialBatches.table.noLotNumber')}
                        </TableCell>
                        <TableCell>
                          {batch.materialName || t('materialBatches.table.unknownMaterial')}
                        </TableCell>
                        <TableCell align="right">
                          {batch.quantity || 0}
                        </TableCell>
                        <TableCell>
                          {batch.purchaseOrderDetails?.number || t('materialBatches.table.noPOConnection')}
                        </TableCell>
                        <TableCell>
                          {batch.purchaseOrderDetails?.supplier?.name || t('materialBatches.table.unknownSupplier')}
                        </TableCell>
                        <TableCell>
                          {batch.purchaseOrderDetails?.id && (
                            <Tooltip title={t('materialBatches.table.viewPODetails')}>
                              <IconButton
                                size="small"
                                component={RouterLink}
                                to={`/purchase-orders/${batch.purchaseOrderDetails.id}`}
                                color="primary"
                              >
                                <ShoppingBasketIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Collapse>
          </Paper>
        </Grid>
      )}
      
      {task?.relatedPurchaseOrders?.length > 0 && (
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2, borderRadius: 2 }}>
            <Box 
              sx={sectionHeaderStyle}
              onClick={() => toggleSection('linkedPurchaseOrders')}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LinkIcon color="primary" fontSize="small" />
                <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                  {t('sections.poReservations')}
                </Typography>
                {task.relatedPurchaseOrders?.length > 0 && (
                  <Chip label={task.relatedPurchaseOrders.length} size="small" color="secondary" variant="outlined" sx={{ height: 22, fontSize: '0.75rem' }} />
                )}
              </Box>
              <IconButton size="small">
                {expandedSections.linkedPurchaseOrders ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
            
            <Collapse in={expandedSections.linkedPurchaseOrders}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {/* Zamówienia automatyczne */}
                {task.purchaseOrders && task.purchaseOrders.map((po, index) => (
                  <Chip
                    key={`po-${index}`}
                    label={po.number || po.poNumber || po.id}
                    component={RouterLink}
                    to={`/purchase-orders/${po.id}`}
                    clickable
                    icon={<ShoppingBasketIcon />}
                    color="primary"
                    variant="outlined"
                    sx={{ 
                      '&:hover': { 
                        backgroundColor: 'primary.light',
                        color: 'white'
                      }
                    }}
                  />
                ))}
                
                {/* Ręcznie powiązane zamówienia */}
                {task.linkedPurchaseOrders && task.linkedPurchaseOrders.map((po, index) => (
                  <Chip
                    key={`linked-po-${index}`}
                    label={po.number || po.id}
                    component={RouterLink}
                    to={`/purchase-orders/${po.id}`}
                    clickable
                    icon={<ShoppingBasketIcon />}
                    color="secondary"
                    variant="outlined"
                    sx={{ 
                      '&:hover': { 
                        backgroundColor: 'secondary.light',
                        color: 'white'
                      }
                    }}
                  />
                ))}
              </Box>
            </Collapse>
          </Paper>
        </Grid>
      )}
      

    </>
  );
};

export default TaskDetails; 