/**
 * Komponent zakładki "Materiały i Koszty" w szczegółach zadania produkcyjnego
 * Wydzielony z TaskDetailsPage.js w celu lepszej organizacji kodu
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Typography,
  Paper,
  Grid,
  Chip,
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Checkbox,
  Alert,
  Tooltip
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  Inventory as InventoryIcon,
  BookmarkAdd as BookmarkAddIcon,
  Close as CloseIcon,
  BuildCircle as BuildCircleIcon
} from '@mui/icons-material';

// Import ikon z parent komponentu - będą przekazane jako props
// import { PackagingIcon, RawMaterialsIcon } from '../icons';

import { useTranslation } from '../../hooks/useTranslation';
import { 
  getConsumedQuantityForMaterial, 
  isConsumptionExceedingIssued, 
  calculateConsumptionExcess 
} from '../../utils/productionUtils';
import POReservationManager from './POReservationManager';

const MaterialsAndCostsTab = ({
  // Dane
  task,
  materials,
  materialQuantities,
  editMode,
  errors,
  includeInCosts,
  consumedIncludeInCosts,
  consumedBatchPrices,
  
  // Funkcje obliczeniowe
  calculateWeightedUnitPrice,
  calculateMaterialReservationCoverage,
  calculateIssuedQuantityForMaterial,
  getPriceBreakdownTooltip,
  getPOReservationsForMaterial,
  renderMaterialCostsSummary,
  
  // Handlery
  handleOpenPackagingDialog,
  handleOpenRawMaterialsDialog,
  handleOpenConsumeMaterialsDialog,
  handleDeleteMaterial,
  handleQuantityChange,
  handleIncludeInCostsChange,
  handleConsumedIncludeInCostsChange,
  handleEditConsumption,
  handleDeleteConsumption,
  handleSaveChanges,
  handleDeleteSingleReservation,
  
  // Settery
  setReserveDialogOpen,
  setEditMode,
  setMaterialQuantities,
  
  // Funkcje pomocnicze
  fetchTaskBasicData,
  fetchPOReservations,
  
  // Ikony jako props
  PackagingIcon,
  RawMaterialsIcon
}) => {
  const { t } = useTranslation('taskDetails');
  const navigate = useNavigate();

  return (
    <Grid container spacing={3}>
      {/* Sekcja materiałów */}
      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="h6" component="h2">{t('materials.title')}</Typography>
              {(() => {
                // Sprawdź czy którykolwiek materiał przekracza plan mieszań
                const hasConsumptionExcess = materials.some(material => {
                  const materialId = material.inventoryItemId || material.id;
                  const consumedQuantity = getConsumedQuantityForMaterial(task.consumedMaterials, materialId);
                  const issuedQuantity = calculateIssuedQuantityForMaterial(material.name);
                  return isConsumptionExceedingIssued(consumedQuantity, issuedQuantity);
                });

                if (hasConsumptionExcess) {
                  return (
                    <Tooltip title={t('materials.warnings.generalConsumptionWarning')}>
                      <Alert 
                        severity="warning" 
                        sx={{ 
                          py: 0, 
                          px: 1, 
                          '& .MuiAlert-message': { fontSize: '0.875rem' }
                        }}
                        icon={<WarningIcon fontSize="small" />}
                      >
                        {t('materials.warnings.consumptionExceedsIssued')}
                      </Alert>
                    </Tooltip>
                  );
                }
                return null;
              })()}
            </Box>
            <Box>
              <Button 
                variant="outlined" 
                color="primary" 
                startIcon={<PackagingIcon />} 
                onClick={handleOpenPackagingDialog} 
                sx={{ mt: 2, mb: 2, mr: 2 }}
              >
                {t('materials.addPackaging')}
              </Button>
              <Button 
                variant="outlined" 
                color="secondary" 
                startIcon={<RawMaterialsIcon />} 
                onClick={handleOpenRawMaterialsDialog} 
                sx={{ mt: 2, mb: 2, mr: 2 }}
              >
                {t('materials.addRawMaterials')}
              </Button>
              <Button 
                variant="outlined" 
                color="primary" 
                startIcon={<BookmarkAddIcon />} 
                onClick={() => setReserveDialogOpen(true)} 
                sx={{ mt: 2, mb: 2, mr: 2 }}
              >
                {t('materials.reserveMaterials')}
              </Button>
              <Button 
                variant="outlined" 
                color="warning" 
                startIcon={<InventoryIcon />} 
                onClick={handleOpenConsumeMaterialsDialog} 
                sx={{ mt: 2, mb: 2 }} 
                disabled={!materials.some(material => { 
                  const materialId = material.inventoryItemId || material.id; 
                  const reservedBatches = task.materialBatches && task.materialBatches[materialId]; 
                  return reservedBatches && reservedBatches.length > 0; 
                })}
              >
                {t('materials.consumeMaterials')}
              </Button>
            </Box>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('materials.table.name')}</TableCell>
                  <TableCell>{t('materials.table.quantity')}</TableCell>
                  <TableCell>{t('materials.table.unit')}</TableCell>
                  <TableCell>{t('materials.table.actualQuantity')}</TableCell>
                  <TableCell>{t('materials.table.issuedQuantity')}</TableCell>
                  <TableCell>{t('materials.table.consumedQuantity')}</TableCell>
                  <TableCell>{t('materials.table.unitPrice')}</TableCell>
                  <TableCell>{t('materials.table.cost')}</TableCell>
                  <TableCell>{t('materials.table.reservedBatches')}</TableCell>
                  <TableCell>{t('materials.table.include')}</TableCell>
                  <TableCell>{t('materials.table.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {materials.map((material) => {
                  const materialId = material.inventoryItemId || material.id;
                  const reservedBatches = task.materialBatches && task.materialBatches[materialId];
                  const quantity = materialQuantities[material.id] || material.quantity || 0;
                  // Użyj średniej ważonej ceny uwzględniającej rezerwacje PO
                  const unitPrice = calculateWeightedUnitPrice(material, materialId);
                  const cost = quantity * unitPrice;
                  
                  // Oblicz pokrycie rezerwacji dla kolorowania wiersza
                  const reservationCoverage = calculateMaterialReservationCoverage(material, materialId);
                  
                  // Sprawdź czy konsumpcja przekracza plan mieszań
                  const consumedQuantity = getConsumedQuantityForMaterial(task.consumedMaterials, materialId);
                  const issuedQuantity = calculateIssuedQuantityForMaterial(material.name);
                  const hasConsumptionExcess = isConsumptionExceedingIssued(consumedQuantity, issuedQuantity);
                  
                  // Ustaw kolor tła: ostrzeżenie ma priorytet nad zarezerwowaniem
                  let rowBackgroundColor = 'transparent';
                  if (hasConsumptionExcess) {
                    rowBackgroundColor = 'rgba(255, 152, 0, 0.08)'; // Pomarańczowy dla przekroczenia
                  } else if (reservationCoverage.hasFullCoverage) {
                    rowBackgroundColor = 'rgba(76, 175, 80, 0.08)'; // Zielony dla pełnej rezerwacji
                  }
                  
                  return (
                    <TableRow 
                      key={material.id}
                      sx={{ 
                        backgroundColor: rowBackgroundColor,
                        '&:hover': { 
                          backgroundColor: hasConsumptionExcess 
                            ? 'rgba(255, 152, 0, 0.12)' // Pomarańczowy hover dla przekroczenia
                            : reservationCoverage.hasFullCoverage 
                              ? 'rgba(76, 175, 80, 0.12)' // Zielony hover dla rezerwacji
                              : 'rgba(0, 0, 0, 0.04)' // Standardowy hover
                        }
                      }}
                    >
                      <TableCell>{material.name}</TableCell>
                      <TableCell>{material.quantity}</TableCell>
                      <TableCell>{material.unit}</TableCell>
                      <TableCell>
                        {editMode ? (
                          <TextField 
                            type="number" 
                            value={materialQuantities[material.id] || 0} 
                            onChange={(e) => handleQuantityChange(material.id, e.target.value)} 
                            onWheel={(e) => e.target.blur()} 
                            error={Boolean(errors[material.id])} 
                            helperText={errors[material.id]} 
                            inputProps={{ min: 0, step: 'any' }} 
                            size="small" 
                            sx={{ width: '130px' }} 
                          />
                        ) : (
                          materialQuantities[material.id] || 0
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => { 
                          const issuedQuantity = calculateIssuedQuantityForMaterial(material.name); 
                          return issuedQuantity > 0 ? `${issuedQuantity} ${material.unit}` : '—'; 
                        })()}
                      </TableCell>
                      <TableCell>
                        {(() => { 
                          const consumedQuantity = getConsumedQuantityForMaterial(task.consumedMaterials, materialId);
                          const issuedQuantity = calculateIssuedQuantityForMaterial(material.name);
                          const isExceeding = isConsumptionExceedingIssued(consumedQuantity, issuedQuantity);
                          const excessPercentage = calculateConsumptionExcess(consumedQuantity, issuedQuantity);
                          
                          if (consumedQuantity <= 0) {
                            return '—';
                          }
                          
                          return (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <span>{consumedQuantity} {material.unit}</span>
                              {isExceeding && (
                                <Tooltip title={t('materials.warnings.consumptionExcessTooltip', { percentage: excessPercentage.toFixed(1) })}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <WarningIcon sx={{ color: '#ff9800', fontSize: '16px' }} />
                                    <Chip 
                                      label={`+${excessPercentage.toFixed(1)}%`}
                                      size="small"
                                      color="warning"
                                      sx={{ fontSize: '10px', height: '20px' }}
                                    />
                                  </Box>
                                </Tooltip>
                              )}
                            </Box>
                          );
                        })()}
                      </TableCell>
                      <TableCell 
                        title={getPriceBreakdownTooltip(material, materialId)}
                        sx={{ cursor: 'help' }}
                      >
                        {(() => {
                          const activePOReservations = getPOReservationsForMaterial(materialId).filter(reservation => {
                            if (reservation.status === 'pending') return true;
                            if (reservation.status === 'delivered') {
                              const convertedQuantity = reservation.convertedQuantity || 0;
                              const reservedQuantity = reservation.reservedQuantity || 0;
                              return convertedQuantity < reservedQuantity;
                            }
                            return false;
                          });
                          
                          // Pokaż cenę jeśli są standardowe rezerwacje lub aktywne rezerwacje PO
                          const hasAnyReservations = (reservedBatches && reservedBatches.length > 0) || activePOReservations.length > 0;
                          
                          return hasAnyReservations ? `${unitPrice.toFixed(4)} €` : '—';
                        })()}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const activePOReservations = getPOReservationsForMaterial(materialId).filter(reservation => {
                            if (reservation.status === 'pending') return true;
                            if (reservation.status === 'delivered') {
                              const convertedQuantity = reservation.convertedQuantity || 0;
                              const reservedQuantity = reservation.reservedQuantity || 0;
                              return convertedQuantity < reservedQuantity;
                            }
                            return false;
                          });
                          
                          // Pokaż koszt jeśli są standardowe rezerwacje lub aktywne rezerwacje PO
                          const hasAnyReservations = (reservedBatches && reservedBatches.length > 0) || activePOReservations.length > 0;
                          
                          return hasAnyReservations ? `${cost.toFixed(2)} €` : '—';
                        })()}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          // Standardowe rezerwacje magazynowe
                          const standardReservations = reservedBatches || [];
                          
                          // Rezerwacje z PO dla tego materiału (tylko te które nie zostały w pełni przekształcone)
                          const allPOReservations = getPOReservationsForMaterial(materialId);
                          const poReservationsForMaterial = allPOReservations
                            .filter(reservation => {
                              // Pokaż chip tylko jeśli:
                              // 1. Status to 'pending' (oczekuje na dostawę)
                              // 2. Status to 'delivered' ale nie wszystko zostało przekształcone
                              // 3. Status to 'converted' - nie pokazuj wcale
                              if (reservation.status === 'pending') return true;
                              if (reservation.status === 'delivered') {
                                const convertedQuantity = reservation.convertedQuantity || 0;
                                const reservedQuantity = reservation.reservedQuantity || 0;
                                return convertedQuantity < reservedQuantity;
                              }
                              return false; // nie pokazuj dla 'converted' lub innych statusów
                            });

                          
                          // Sprawdź czy są jakiekolwiek rezerwacje
                          const hasAnyReservations = standardReservations.length > 0 || poReservationsForMaterial.length > 0;
                          
                          if (!hasAnyReservations) {
                            return (
                              <Typography variant="body2" color="text.secondary">
                                Brak zarezerwowanych partii
                              </Typography>
                            );
                          }
                          
                          // Oblicz łączną sumę zarezerwowanych ilości
                          const totalStandardReserved = standardReservations.reduce((sum, batch) => sum + (batch.quantity || 0), 0);
                          const totalPOReserved = poReservationsForMaterial.reduce((sum, reservation) => {
                            const convertedQuantity = reservation.convertedQuantity || 0;
                            const reservedQuantity = reservation.reservedQuantity || 0;
                            return sum + (reservedQuantity - convertedQuantity);
                          }, 0);
                          const totalReserved = totalStandardReserved + totalPOReserved;
                          
                          return (
                            <Box>
                              {/* Suma zarezerwowanych ilości */}
                              {totalReserved > 0 && (
                                <Box sx={{ mb: 1 }}>
                                  <Typography 
                                    variant="body2" 
                                    sx={{ 
                                      fontWeight: 600, 
                                      color: 'primary.main',
                                      fontSize: '0.875rem'
                                    }}
                                  >
                                    Suma: {totalReserved.toFixed(2)} {material.unit}
                                  </Typography>
                                </Box>
                              )}
                              
                              {/* Standardowe rezerwacje magazynowe */}
                              {standardReservations.map((batch, index) => (
                                <Chip 
                                  key={`standard-${index}`}
                                  size="small" 
                                  label={`${batch.batchNumber} (${batch.quantity} ${material.unit})`} 
                                  color="info" 
                                  variant="outlined" 
                                  sx={{ 
                                    mr: 0.5, 
                                    mb: 0.5, 
                                    cursor: 'pointer',
                                    '& .MuiChip-deleteIcon': {
                                      fontSize: '16px',
                                      '&:hover': {
                                        color: 'error.main'
                                      }
                                    }
                                  }} 
                                  onClick={() => navigate(`/inventory/${materialId}/batches`)}
                                  onDelete={(e) => {
                                    e.stopPropagation(); // Zapobiega wywołaniu onClick
                                    handleDeleteSingleReservation(materialId, batch.batchId, batch.batchNumber);
                                  }}
                                  deleteIcon={<CloseIcon />}
                                />
                              ))}
                              
                              {/* Rezerwacje z PO - tylko te które nie zostały w pełni przekształcone */}
                              {poReservationsForMaterial.map((reservation, index) => {
                                const convertedQuantity = reservation.convertedQuantity || 0;
                                const reservedQuantity = reservation.reservedQuantity || 0;
                                const deliveredQuantity = reservation.deliveredQuantity || 0;
                                const availableQuantity = reservedQuantity - convertedQuantity;
                                
                                // Określ status wizualny na podstawie dostawy
                                const isDelivered = deliveredQuantity > 0;
                                const chipColor = isDelivered ? 'success' : 'warning';
                                
                                const tooltipText = [
                                  `Rezerwacja z zamówienia ${reservation.poNumber}`,
                                  `Status: ${reservation.status}`,
                                  `Zarezerwowano: ${reservedQuantity} ${material.unit}`,
                                  deliveredQuantity > 0 ? `Dostarczone: ${deliveredQuantity} ${material.unit}` : null,
                                  convertedQuantity > 0 ? `Przekształcone: ${convertedQuantity} ${material.unit}` : null
                                ].filter(Boolean).join('\n');
                                
                                return (
                                  <Chip 
                                    key={`po-${index}`}
                                    size="small" 
                                    label={`PO: ${reservation.poNumber} (${availableQuantity} ${material.unit}${isDelivered ? ' ✓' : ''})`} 
                                    color={chipColor} 
                                    variant="outlined" 
                                    sx={{ mr: 0.5, mb: 0.5 }}
                                    title={tooltipText}
                                  />
                                );
                              })}
                            </Box>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Checkbox 
                          checked={includeInCosts[material.id] || false} 
                          onChange={(e) => handleIncludeInCostsChange(material.id, e.target.checked)} 
                          color="primary" 
                        />
                      </TableCell>
                      <TableCell>
                        {editMode ? (
                          <Box sx={{ display: 'flex' }}>
                            <IconButton 
                              color="primary" 
                              onClick={handleSaveChanges} 
                              title="Zapisz zmiany"
                            >
                              <SaveIcon />
                            </IconButton>
                            <IconButton 
                              color="error" 
                              onClick={() => setEditMode(false)} 
                              title="Anuluj edycję"
                            >
                              <CancelIcon />
                            </IconButton>
                          </Box>
                        ) : (
                          <Box sx={{ display: 'flex' }}>
                            <IconButton 
                              color="primary" 
                              onClick={() => { 
                                setEditMode(true); 
                                setMaterialQuantities(prev => ({ 
                                  ...prev, 
                                  [material.id]: materialQuantities[material.id] || 0 
                                })); 
                              }} 
                              title="Edytuj ilość"
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton 
                              color="error" 
                              onClick={() => handleDeleteMaterial(material)} 
                              title="Usuń materiał"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Box>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {renderMaterialCostsSummary()}
        </Paper>
      </Grid>
      
      {/* Sekcja skonsumowanych materiałów */}
      {task.consumedMaterials && task.consumedMaterials.length > 0 && (
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" component="h2">{t('consumedMaterials.title')}</Typography>
              {(() => {
                const totalCompletedQuantity = task.totalCompletedQuantity || 0;
                const remainingQuantity = Math.max(0, task.quantity - totalCompletedQuantity);
                const isFullyProduced = remainingQuantity === 0;
                if (isFullyProduced) {
                  const isConsumptionConfirmed = task.materialConsumptionConfirmed === true;
                  const buttonColor = isConsumptionConfirmed ? "success" : "info";
                  const buttonText = isConsumptionConfirmed ? t('consumedMaterials.confirmedConsumption') : t('consumedMaterials.manageConsumption');
                  return (
                    <Button 
                      variant="outlined" 
                      color={buttonColor} 
                      startIcon={<BuildCircleIcon />} 
                      component={Link} 
                      to={`/production/consumption/${task.id}`} 
                      size="small"
                    >
                      {buttonText}
                    </Button>
                  );
                } 
                return null;
              })()}
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('consumedMaterials.table.material')}</TableCell>
                    <TableCell>{t('consumedMaterials.table.batch')}</TableCell>
                    <TableCell>{t('consumedMaterials.table.consumedQuantity')}</TableCell>
                    <TableCell>{t('consumedMaterials.table.unitPrice')}</TableCell>
                    <TableCell>{t('consumedMaterials.table.include')}</TableCell>
                    <TableCell>{t('consumedMaterials.table.consumptionDate')}</TableCell>
                    <TableCell>{t('consumedMaterials.table.user')}</TableCell>
                    <TableCell>{t('consumedMaterials.table.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {task.consumedMaterials.map((consumed, index) => {
                    const material = materials.find(m => (m.inventoryItemId || m.id) === consumed.materialId);
                    let batchNumber = consumed.batchNumber || consumed.batchId;
                    let batch = null;
                    if (!consumed.batchNumber && task.materialBatches && task.materialBatches[consumed.materialId]) {
                      batch = task.materialBatches[consumed.materialId].find(b => b.batchId === consumed.batchId);
                      if (batch && batch.batchNumber) { 
                        batchNumber = batch.batchNumber; 
                      }
                    }
                    const batchPrice = consumedBatchPrices[consumed.batchId] || (batch && batch.unitPrice) || 0;
                    const materialId = material?.inventoryItemId || material?.id;
                    return (
                      <TableRow key={index}>
                        <TableCell>{material ? material.name : 'Nieznany materiał'}</TableCell>
                        <TableCell>
                          <Chip 
                            size="small" 
                            label={`${batchNumber} (${consumed.quantity} ${material ? material.unit : ''})`} 
                            color="info" 
                            variant="outlined" 
                            sx={{ cursor: 'pointer' }} 
                            onClick={() => navigate(`/inventory/${materialId}/batches`)} 
                          />
                        </TableCell>
                        <TableCell>{consumed.quantity} {material ? material.unit : ''}</TableCell>
                        <TableCell>{batchPrice > 0 ? `${Number(batchPrice).toFixed(4)} €` : '—'}</TableCell>
                        <TableCell>
                          <Checkbox 
                            checked={consumedIncludeInCosts[index] || false} 
                            onChange={(e) => handleConsumedIncludeInCostsChange(index, e.target.checked)} 
                            color="primary" 
                          />
                        </TableCell>
                        <TableCell>{new Date(consumed.timestamp).toLocaleString('pl')}</TableCell>
                        <TableCell>{consumed.userName || 'Nieznany użytkownik'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <IconButton 
                              size="small" 
                              color="primary" 
                              onClick={() => handleEditConsumption(consumed)} 
                              title="Edytuj konsumpcję"
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton 
                              size="small" 
                              color="error" 
                              onClick={() => handleDeleteConsumption(consumed)} 
                              title="Usuń konsumpcję"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      )}
      
      {/* Sekcja rezerwacji PO */}
      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <POReservationManager 
            taskId={task?.id}
            materials={task?.materials || []}
            onUpdate={async () => {
              // Odśwież podstawowe dane zadania i rezerwacje PO
              await Promise.all([
                fetchTaskBasicData(),
                fetchPOReservations()
              ]);
            }}
          />
        </Paper>
      </Grid>
    </Grid>
  );
};

export default MaterialsAndCostsTab;
