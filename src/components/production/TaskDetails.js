import React, { useEffect, useState } from 'react';
import { Grid, Paper, Typography, Box, Button, Chip, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, IconButton, Collapse, Tooltip } from '@mui/material';
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
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import { formatDateTime } from '../../utils/formatters';
import { getWorkstationById } from '../../services/workstationService';
import { useNotification } from '../../hooks/useNotification';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';

const TaskDetails = ({ task }) => {
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
  
  // Ładuj dane stanowiska produkcyjnego, jeśli zadanie ma przypisane ID stanowiska
  useEffect(() => {
    const fetchWorkstation = async () => {
      if (task?.workstationId) {
        try {
          const workstationData = await getWorkstationById(task.workstationId);
          setWorkstation(workstationData);
        } catch (error) {
          console.error('Błąd podczas pobierania stanowiska produkcyjnego:', error);
          showError('Nie udało się pobrać informacji o stanowisku produkcyjnym');
        }
      }
    };
    
    fetchWorkstation();
  }, [task?.workstationId, showError]);
  
  // Pobierz LOTy powiązane z tym MO i ich powiązania z PO
  useEffect(() => {
    const fetchRelatedBatches = async () => {
      if (!task?.moNumber) return;
      
      try {
        setLoading(true);
        
        // Sprawdź, czy zadanie ma zarejestrowane partie materiałów
        const batchesWithPO = [];
        
        // 1. Pobierz partie z materialBatches (partie zarezerwowane dla MO)
        if (task.materialBatches) {
          console.log("Znaleziono zarezerwowane partie materiałów:", task.materialBatches);
          
          // Dla każdego materiału w materialBatches
          for (const [materialId, batches] of Object.entries(task.materialBatches)) {
            // Dla każdej partii materiału
            for (const batchInfo of batches) {
              try {
                // Pobierz szczegółowe dane partii z bazy danych
                const batchRef = doc(db, 'inventoryBatches', batchInfo.batchId);
                const batchSnapshot = await getDoc(batchRef);
                
                if (batchSnapshot.exists()) {
                  const batchData = batchSnapshot.data();
                  
                  // Jeśli partia ma dane o powiązanym PO
                  if (batchData.purchaseOrderDetails) {
                    batchesWithPO.push({
                      id: batchInfo.batchId,
                      lotNumber: batchInfo.batchNumber || batchData.lotNumber || batchData.batchNumber,
                      quantity: batchInfo.quantity,
                      materialName: batchData.itemName || "Materiał",
                      purchaseOrderDetails: batchData.purchaseOrderDetails,
                      source: 'reserved' // Oznacz jako zarezerwowane
                    });
                  }
                }
              } catch (error) {
                console.error(`Błąd podczas pobierania danych partii ${batchInfo.batchId}:`, error);
              }
            }
          }
        }

        // 1.5. Pobierz partie ze skonsumowanych materiałów (consumedMaterials)
        if (task.consumedMaterials && task.consumedMaterials.length > 0) {
          console.log("Znaleziono skonsumowane materiały:", task.consumedMaterials);
          
          // Dla każdego skonsumowanego materiału
          for (const consumed of task.consumedMaterials) {
            if (consumed.batchId) {
              try {
                // Pobierz szczegółowe dane partii z bazy danych
                const batchRef = doc(db, 'inventoryBatches', consumed.batchId);
                const batchSnapshot = await getDoc(batchRef);
                
                if (batchSnapshot.exists()) {
                  const batchData = batchSnapshot.data();
                  
                  // Jeśli partia ma dane o powiązanym PO
                  if (batchData.purchaseOrderDetails) {
                    // Sprawdź czy już nie dodaliśmy tej partii z zarezerwowanych materiałów
                    const existingBatch = batchesWithPO.find(batch => batch.id === consumed.batchId);
                    if (!existingBatch) {
                      batchesWithPO.push({
                        id: consumed.batchId,
                        lotNumber: consumed.batchNumber || batchData.lotNumber || batchData.batchNumber,
                        quantity: consumed.quantity,
                        materialName: batchData.itemName || "Materiał",
                        purchaseOrderDetails: batchData.purchaseOrderDetails,
                        source: 'consumed' // Oznacz jako skonsumowane
                      });
                    }
                  }
                }
              } catch (error) {
                console.error(`Błąd podczas pobierania danych partii skonsumowanej ${consumed.batchId}:`, error);
              }
            }
          }
        }
        
        // 2. Pobierz wszystkie partie związane z tym MO (produkty końcowe)
        const batchesQuery = query(
          collection(db, 'inventoryBatches'),
          where('moNumber', '==', task.moNumber)
        );
        
        const batchesSnapshot = await getDocs(batchesQuery);
        const batches = batchesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Dla każdej partii sprawdź czy ma powiązane zamówienie zakupu
        for (const batch of batches) {
          // Jeśli partia ma dane o powiązanym PO
          if (batch.purchaseOrderDetails) {
            batchesWithPO.push(batch);
          }
        }
        
        setRelatedBatches(batchesWithPO);
        setLoading(false);
      } catch (error) {
        console.error('Błąd podczas pobierania danych o partiach:', error);
        showError('Nie udało się pobrać informacji o partiach produktów');
        setLoading(false);
      }
    };
    
    fetchRelatedBatches();
  }, [task?.moNumber, task?.materialBatches, task?.consumedMaterials, showError]);
  
  // Styl dla nagłówka sekcji z ikoną zwijania/rozwijania
  const sectionHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    mb: expandedSections ? 2 : 0,
    py: 0.5,
    pl: 0.5,
    borderRadius: 1,
    '&:hover': {
      bgcolor: 'rgba(0, 0, 0, 0.04)'
    }
  };
  
  return (
    <>
      <Grid item xs={12}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Box 
            sx={sectionHeaderStyle}
            onClick={() => toggleSection('relatedOrders')}
          >
            <Tooltip title="Kliknij, aby zwinąć/rozwinąć sekcję">
              <Typography variant="h6">
                Powiązane zamówienia
              </Typography>
            </Tooltip>
            <IconButton size="small">
              {expandedSections.relatedOrders ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          
          <Collapse in={expandedSections.relatedOrders}>
            {hasCustomerOrder && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'medium' }}>
                  Zamówienie klienta
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
                Powiązane zamówienia zakupowe z LOTami
              </Typography>
              {relatedBatches.length > 0 ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                  {relatedBatches.map((batch, index) => (
                    <Box key={batch.id} sx={{ mb: 2, mr: 2, border: '1px solid #e0e0e0', borderRadius: 1, p: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <BatchIcon color="info" sx={{ mr: 1 }} fontSize="small" />
                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                          LOT: {batch.lotNumber || batch.batchNumber}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <ReceiptIcon color="primary" sx={{ mr: 1 }} fontSize="small" />
                        <Typography variant="body2">
                          PO: {batch.purchaseOrderDetails.number || '-'}
                        </Typography>
                      </Box>
                      <Button
                        variant="outlined"
                        size="small"
                        component={RouterLink}
                        to={`/purchase-orders/${batch.purchaseOrderDetails.id}`}
                        startIcon={<ShoppingBasketIcon />}
                        sx={{ mt: 1 }}
                      >
                        Zobacz szczegóły PO
                      </Button>
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
                  <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                    {/* Zamówienia automatyczne z purchaseOrders */}
                    {task.purchaseOrders && task.purchaseOrders.map((po, index) => (
                      <Button
                        key={`po-${index}`}
                        variant="outlined"
                        size="small"
                        component={RouterLink}
                        to={`/purchase-orders/${po.id}`}
                        startIcon={<ShoppingBasketIcon />}
                        sx={{ mr: 1, mb: 1 }}
                      >
                        {po.number || po.poNumber || po.id}
                      </Button>
                    ))}
                    
                    {/* Ręcznie powiązane zamówienia z linkedPurchaseOrders */}
                    {task.linkedPurchaseOrders && task.linkedPurchaseOrders.map((po, index) => (
                      <Button
                        key={`linked-po-${index}`}
                        variant="outlined"
                        size="small"
                        component={RouterLink}
                        to={`/purchase-orders/${po.id}`}
                        startIcon={<ShoppingBasketIcon />}
                        sx={{ mr: 1, mb: 1, borderColor: 'secondary.main', color: 'secondary.main' }}
                      >
                        {po.number || po.id}
                      </Button>
                    ))}
                  </Box>
                </>
              )}
            </Box>
          </Collapse>
        </Paper>
      </Grid>
      
      {task?.scheduledDate && (
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Box 
              sx={sectionHeaderStyle}
              onClick={() => toggleSection('productionTime')}
            >
              <Typography variant="h6">
                Informacje o czasie produkcji
              </Typography>
              <IconButton size="small">
                {expandedSections.productionTime ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
            
            <Collapse in={expandedSections.productionTime}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <ScheduleIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                  Zaplanowana data i godzina rozpoczęcia:
                </Typography>
                <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                  {formatDateTime(task.scheduledDate)}
                </Typography>
              </Box>
              
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <ScheduleIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                  Planowana data i godzina zakończenia:
                </Typography>
                <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                  {formatDateTime(task.endDate)}
                </Typography>
              </Box>
              
              {task.productionTimePerUnit > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                  <ScheduleIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                    Czas produkcji na jednostkę:
                  </Typography>
                  <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                    {parseFloat(task.productionTimePerUnit).toFixed(2)} min./szt.
                  </Typography>
                </Box>
              )}
              
              {task.estimatedDuration > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                  <ScheduleIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                    Całkowity planowany czas produkcji:
                  </Typography>
                  <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                    {(task.estimatedDuration / 60).toFixed(2)} godz.
                  </Typography>
                </Box>
              )}
              
              {/* Informacja o stanowisku produkcyjnym */}
              {workstation && (
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
                  <BusinessIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                    Stanowisko produkcyjne:
                  </Typography>
                  <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                    {workstation.name}
                    {workstation.location && ` (lokalizacja: ${workstation.location})`}
                  </Typography>
                </Box>
              )}
            </Collapse>
          </Paper>
        </Grid>
      )}
      
      {/* Nowa sekcja dla informacji o partii produktu */}
      {hasProductBatchInfo && (
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Box 
              sx={sectionHeaderStyle}
              onClick={() => toggleSection('productBatch')}
            >
              <Typography variant="h6">
                Dane partii produktu końcowego
              </Typography>
              <IconButton size="small">
                {expandedSections.productBatch ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
            
            <Collapse in={expandedSections.productBatch}>
              {task.lotNumber && (
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <BatchIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                    Numer partii (LOT):
                  </Typography>
                  <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                    {task.lotNumber}
                  </Typography>
                </Box>
              )}
              
              {task.expiryDate && (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <DateIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="subtitle1" component="span" sx={{ fontWeight: 'medium' }}>
                    Data ważności:
                  </Typography>
                  <Typography variant="body1" component="span" sx={{ ml: 1 }}>
                    {task.expiryDate instanceof Date 
                      ? task.expiryDate.toLocaleDateString('pl-PL')
                      : typeof task.expiryDate === 'string'
                        ? new Date(task.expiryDate).toLocaleDateString('pl-PL')
                        : task.expiryDate && task.expiryDate.toDate
                          ? task.expiryDate.toDate().toLocaleDateString('pl-PL')
                          : 'Nie określono'}
                  </Typography>
                </Box>
              )}
            </Collapse>
          </Paper>
        </Grid>
      )}
      
      {/* Wyświetl partie materiałów zarezerwowane dla tego MO */}
      {relatedBatches.length > 0 && (
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Box 
              sx={sectionHeaderStyle}
              onClick={() => toggleSection('materialBatches')}
            >
              <Typography variant="h6">
                Partie materiałów powiązane z zamówieniami zakupowymi (PO)
              </Typography>
              <IconButton size="small">
                {expandedSections.materialBatches ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
            
            <Collapse in={expandedSections.materialBatches}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>LOT</TableCell>
                      <TableCell>Materiał</TableCell>
                      <TableCell align="right">Ilość</TableCell>
                      <TableCell>Nr zamówienia (PO)</TableCell>
                      <TableCell>Dostawca</TableCell>
                      <TableCell>Akcje</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {relatedBatches.map((batch) => (
                      <TableRow key={batch.id} hover>
                        <TableCell sx={{ fontWeight: 'medium' }}>
                          {batch.lotNumber || "Brak numeru LOT"}
                        </TableCell>
                        <TableCell>
                          {batch.materialName || "Nieznany materiał"}
                        </TableCell>
                        <TableCell align="right">
                          {batch.quantity || 0}
                        </TableCell>
                        <TableCell>
                          {batch.purchaseOrderDetails?.number || "Brak powiązania z PO"}
                        </TableCell>
                        <TableCell>
                          {batch.purchaseOrderDetails?.supplier?.name || "Nieznany dostawca"}
                        </TableCell>
                        <TableCell>
                          {batch.purchaseOrderDetails?.id && (
                            <Button
                              variant="outlined"
                              size="small"
                              component={RouterLink}
                              to={`/purchase-orders/${batch.purchaseOrderDetails.id}`}
                              startIcon={<ShoppingBasketIcon />}
                            >
                              Szczegóły PO
                            </Button>
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
          <Paper sx={{ p: 2, mb: 2 }}>
            <Box 
              sx={sectionHeaderStyle}
              onClick={() => toggleSection('linkedPurchaseOrders')}
            >
              <Typography variant="h6">
                Powiązane zamówienia zakupowe
              </Typography>
              <IconButton size="small">
                {expandedSections.linkedPurchaseOrders ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>
            
            <Collapse in={expandedSections.linkedPurchaseOrders}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                {/* Zamówienia automatyczne z purchaseOrders */}
                {task.purchaseOrders && task.purchaseOrders.map((po, index) => (
                  <Button
                    key={`po-${index}`}
                    variant="outlined"
                    size="small"
                    component={RouterLink}
                    to={`/purchase-orders/${po.id}`}
                    startIcon={<ShoppingBasketIcon />}
                    sx={{ mr: 1, mb: 1 }}
                  >
                    {po.number || po.poNumber || po.id}
                  </Button>
                ))}
                
                {/* Ręcznie powiązane zamówienia z linkedPurchaseOrders */}
                {task.linkedPurchaseOrders && task.linkedPurchaseOrders.map((po, index) => (
                  <Button
                    key={`linked-po-${index}`}
                    variant="outlined"
                    size="small"
                    component={RouterLink}
                    to={`/purchase-orders/${po.id}`}
                    startIcon={<ShoppingBasketIcon />}
                    sx={{ mr: 1, mb: 1, borderColor: 'secondary.main', color: 'secondary.main' }}
                  >
                    {po.number || po.id}
                  </Button>
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