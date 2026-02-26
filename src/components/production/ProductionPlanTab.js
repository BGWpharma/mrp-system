import React, { memo } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  IconButton,
  Tooltip,
  FormControlLabel,
  Checkbox,
  Card,
  CardContent,
  useTheme,
  useMediaQuery
} from '@mui/material';
import EnhancedMixingPlan from './EnhancedMixingPlan';
import {
  Add as AddIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { formatDateTime } from '../../utils/formatters';
import { useTranslation } from '../../hooks/useTranslation';

const ProductionPlanTab = ({
  task,
  setTask,
  productionHistory,
  enrichedProductionHistory,
  selectedMachineId,
  setSelectedMachineId,
  availableMachines,
  editingHistoryItem,
  editedHistoryItem,
  setEditedHistoryItem,
  warehouses,
  getUserName,
  onAddHistoryItem,
  onEditHistoryItem,
  onSaveHistoryItemEdit,
  onCancelHistoryItemEdit,
  onDeleteHistoryItem,
  toLocalDateTimeString,
  fromLocalDateTimeString,
  onChecklistItemUpdate,
  fetchAllTaskData,
  ingredientReservationLinks
}) => {
  const { t } = useTranslation('taskDetails');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isVerySmall = useMediaQuery(theme.breakpoints.down('sm'));

  // Helper function to format quantity with specified precision
  const formatQuantityPrecision = (value, precision = 3) => {
    if (value === null || value === undefined || value === '') return '';

    const num = parseFloat(value);
    if (isNaN(num)) return '';

    // Sprawdź czy liczba ma miejsca dziesiętne
    if (num % 1 === 0) {
      return num.toString(); // Zwróć bez miejsc dziesiętnych jeśli to liczba całkowita
    }

    return num.toFixed(precision).replace(/\.?0+$/, ''); // Usuń końcowe zera
  };

  const handleAddHistoryClick = () => {
    const newEditedHistoryItem = {
      quantity: '',
      startTime: new Date(),
      endTime: new Date(),
    };

    let expiryDate = null;
    if (task.expiryDate) {
      try {
        if (task.expiryDate instanceof Date) {
          expiryDate = task.expiryDate;
        } else if (task.expiryDate.toDate && typeof task.expiryDate.toDate === 'function') {
          expiryDate = task.expiryDate.toDate();
        } else if (task.expiryDate.seconds) {
          expiryDate = new Date(task.expiryDate.seconds * 1000);
        } else if (typeof task.expiryDate === 'string') {
          expiryDate = new Date(task.expiryDate);
        }
      } catch (error) {
        console.error('Błąd konwersji daty ważności:', error);
        expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
      }
    } else {
      expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
    }

    setEditedHistoryItem(newEditedHistoryItem);
    
    const historyInventoryData = {
      expiryDate: expiryDate,
      lotNumber: task.lotNumber || `SN/${task.moNumber || ''}`,
      finalQuantity: '',
      warehouseId: task.warehouseId || (warehouses.length > 0 ? warehouses[0].id : '')
    };

    // Call the parent function to handle the dialog opening
    onAddHistoryItem(newEditedHistoryItem, historyInventoryData);
  };



  return (
    <Grid container spacing={3}>
      {/* Sekcja historii produkcji */}
      <Grid item xs={12}>
        <Paper sx={{ p: isMobile ? 2 : 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>{t('productionHistory.title')}</Typography>
          
          {/* 📱 Responsywne kontrolki - selektor maszyny i przycisk dodawania */}
          <Box sx={{ 
            display: 'flex', 
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between', 
            alignItems: isMobile ? 'stretch' : 'center',
            mb: 2, 
            gap: 2 
          }}>
            <Box sx={{ 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'stretch' : 'center',
              gap: 2 
            }}>
              <FormControl 
                size={isMobile ? "medium" : "small"} 
                fullWidth={isMobile}
                sx={{ minWidth: isMobile ? '100%' : 200 }}
              >
                <InputLabel>{t('productionHistory.machineSelector')}</InputLabel>
                <Select
                  value={selectedMachineId}
                  label={t('productionHistory.machineSelector')}
                  onChange={(e) => setSelectedMachineId(e.target.value)}
                >
                  <MenuItem value="">
                    <em>{t('productionHistory.noMachine')}</em>
                  </MenuItem>
                  {availableMachines.map((machine) => (
                    <MenuItem key={machine.id} value={machine.id}>
                      {machine.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              {selectedMachineId && !isVerySmall && (
                <Chip 
                  size="small" 
                  label={`${availableMachines.find(m => m.id === selectedMachineId)?.name || ''}`}
                  color="info"
                  variant="outlined"
                />
              )}
            </Box>
            
            <Button 
              variant="contained" 
              color="primary" 
              startIcon={!isMobile && <AddIcon />}
              onClick={handleAddHistoryClick}
              size={isMobile ? "large" : "small"}
              fullWidth={isMobile}
              sx={{ 
                minHeight: isMobile ? 48 : 'auto' // Większy target dla dotyku
              }}
            >
              {t('productionHistory.addRecord')}
            </Button>
          </Box>

          {productionHistory.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Brak historii produkcji dla tego zadania
            </Typography>
          ) : isMobile ? (
            // 📱 Widok mobilny - Cards zamiast Table
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {enrichedProductionHistory.map((item) => (
                <Card key={item.id} variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="subtitle2" color="primary">
                        {item.startTime ? formatDateTime(item.startTime) : '-'}
                      </Typography>
                      <Chip 
                        size="small" 
                        label={`${formatQuantityPrecision(item.quantity)} ${task.unit}`}
                        color="success"
                      />
                    </Box>
                    
                    <Typography variant="body2" color="text.secondary">
                      ⏱️ Czas: {item.timeSpent ? `${item.timeSpent} min` : '-'}
                    </Typography>
                    
                    <Typography variant="body2" color="text.secondary">
                      👤 Operator: {getUserName(item.userId)}
                    </Typography>
                    
                    {item.endTime && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                        Koniec: {formatDateTime(item.endTime)}
                      </Typography>
                    )}
                    
                    {selectedMachineId && item.machineData && (
                      <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Chip 
                          size="small" 
                          label={`✓ OK: ${item.machineData.okProduced}`}
                          color="success"
                          variant="outlined"
                        />
                        <Chip 
                          size="small" 
                          label={`✗ NOK: ${item.machineData.nokProduced}`}
                          color="error"
                          variant="outlined"
                        />
                        <Chip 
                          size="small" 
                          label={`Σ: ${item.machineData.totalProduced}`}
                          color="primary"
                          variant="outlined"
                        />
                      </Box>
                    )}
                    
                    <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      <IconButton 
                        color="primary" 
                        onClick={() => onEditHistoryItem(item)}
                        size="large"
                        sx={{ 
                          minWidth: 48,
                          minHeight: 48
                        }}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton 
                        color="error" 
                        onClick={() => onDeleteHistoryItem(item)}
                        size="large"
                        sx={{ 
                          minWidth: 48,
                          minHeight: 48
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  </CardContent>
                </Card>
              ))}
              
              {/* Suma dla widoku mobilnego */}
              <Card variant="outlined" sx={{ bgcolor: 'rgba(0, 0, 0, 0.02)' }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                    📊 Podsumowanie
                  </Typography>
                  <Typography variant="body2">
                    Czas: {enrichedProductionHistory.reduce((sum, item) => sum + (item.timeSpent || 0), 0)} min
                  </Typography>
                  <Typography variant="body2">
                    Ilość: {formatQuantityPrecision(
                      enrichedProductionHistory.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0), 
                      3
                    )} {task.unit}
                  </Typography>
                  {selectedMachineId && (
                    <Typography variant="body2">
                      OK: {enrichedProductionHistory.reduce((sum, item) => sum + (item.machineData?.okProduced || 0), 0)} | 
                      NOK: {enrichedProductionHistory.reduce((sum, item) => sum + (item.machineData?.nokProduced || 0), 0)} | 
                      Σ: {enrichedProductionHistory.reduce((sum, item) => sum + (item.machineData?.totalProduced || 0), 0)}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Box>
          ) : (
            // 💻 Widok desktop - Table
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('productionHistory.table.startTime')}</TableCell>
                    <TableCell>{t('productionHistory.table.endTime')}</TableCell>
                    <TableCell>{t('productionHistory.table.duration')}</TableCell>
                    <TableCell>{t('productionHistory.table.quantity')}</TableCell>
                    {selectedMachineId && (
                      <>
                        <TableCell>{t('productionHistory.table.machine')} OK</TableCell>
                        <TableCell>{t('productionHistory.table.machine')} NOK</TableCell>
                        <TableCell>{t('productionHistory.table.machine')} Σ</TableCell>
                      </>
                    )}
                    <TableCell>{t('productionHistory.table.operator')}</TableCell>
                    <TableCell>{t('productionHistory.table.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {enrichedProductionHistory.map((item) => (
                    <TableRow key={item.id}>
                      {editingHistoryItem === item.id ? (
                        <>
                          <TableCell>
                            <TextField 
                              type="datetime-local" 
                              value={editedHistoryItem.startTime instanceof Date ? toLocalDateTimeString(editedHistoryItem.startTime) : ''} 
                              onChange={(e) => {
                                const newDate = e.target.value ? fromLocalDateTimeString(e.target.value) : new Date();
                                setEditedHistoryItem(prev => ({ ...prev, startTime: newDate }));
                              }} 
                              InputLabelProps={{ shrink: true }} 
                              fullWidth 
                              required 
                            />
                          </TableCell>
                          <TableCell>
                            <TextField 
                              type="datetime-local" 
                              value={editedHistoryItem.endTime instanceof Date ? toLocalDateTimeString(editedHistoryItem.endTime) : ''} 
                              onChange={(e) => {
                                const newDate = e.target.value ? fromLocalDateTimeString(e.target.value) : new Date();
                                setEditedHistoryItem(prev => ({ ...prev, endTime: newDate }));
                              }} 
                              InputLabelProps={{ shrink: true }} 
                              fullWidth 
                              required 
                            />
                          </TableCell>
                          <TableCell>
                            {Math.round((editedHistoryItem.endTime.getTime() - editedHistoryItem.startTime.getTime()) / (1000 * 60))} min
                          </TableCell>
                          <TableCell>
                            <TextField 
                              type="number" 
                              value={editedHistoryItem.quantity} 
                              onChange={(e) => setEditedHistoryItem(prev => ({ 
                                ...prev, 
                                quantity: e.target.value === '' ? '' : parseFloat(e.target.value) 
                              }))} 
                              inputProps={{ min: 0, step: 'any' }} 
                              size="small" 
                              fullWidth 
                            />
                          </TableCell>
                          {selectedMachineId && (
                            <>
                              <TableCell>-</TableCell>
                              <TableCell>-</TableCell>
                              <TableCell>-</TableCell>
                            </>
                          )}
                          <TableCell>{getUserName(item.userId)}</TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex' }}>
                              <IconButton 
                                color="primary" 
                                onClick={() => onSaveHistoryItemEdit(item.id)} 
                                title="Zapisz zmiany"
                              >
                                <SaveIcon />
                              </IconButton>
                              <IconButton 
                                color="error" 
                                onClick={onCancelHistoryItemEdit} 
                                title="Anuluj edycję"
                              >
                                <CancelIcon />
                              </IconButton>
                            </Box>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>{item.startTime ? formatDateTime(item.startTime) : '-'}</TableCell>
                          <TableCell>{item.endTime ? formatDateTime(item.endTime) : '-'}</TableCell>
                          <TableCell>{item.timeSpent ? `${item.timeSpent} min` : '-'}</TableCell>
                          <TableCell>{item.quantity} {task.unit}</TableCell>
                          {selectedMachineId && (
                            <>
                              <TableCell>
                                {item.machineData ? (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Chip size="small" label={item.machineData.okProduced} color="success" variant="outlined" />
                                    {item.machineData.okProduced > 0 && (
                                      <Tooltip title={`Szczegóły produkcji: ${item.machineData.productionPeriods?.map(p => p.formattedPeriod).join(', ') || 'Brak szczegółów'}`}>
                                        <InfoIcon fontSize="small" color="info" sx={{ cursor: 'help' }} />
                                      </Tooltip>
                                    )}
                                  </Box>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                {item.machineData ? (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Chip size="small" label={item.machineData.nokProduced} color="error" variant="outlined" />
                                    {item.machineData.nokProduced > 0 && (
                                      <Tooltip title={`Szczegóły produkcji: ${item.machineData.productionPeriods?.map(p => p.formattedPeriod).join(', ') || 'Brak szczegółów'}`}>
                                        <InfoIcon fontSize="small" color="warning" sx={{ cursor: 'help' }} />
                                      </Tooltip>
                                    )}
                                  </Box>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                {item.machineData ? (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Chip size="small" label={item.machineData.totalProduced} color="primary" variant="outlined" />
                                    {item.machineData.totalProduced > 0 && (
                                      <Tooltip title={`Maszyna: ${item.machineData.machineId} | Okresy: ${item.machineData.productionPeriods?.map(p => `${p.formattedPeriod} (${p.production.okCount}/${p.production.nokCount})`).join(', ') || 'Brak szczegółów'}`}>
                                        <InfoIcon fontSize="small" color="info" sx={{ cursor: 'help' }} />
                                      </Tooltip>
                                    )}
                                  </Box>
                                ) : '-'}
                              </TableCell>
                            </>
                          )}
                          <TableCell>{getUserName(item.userId)}</TableCell>
                          <TableCell>
                            <IconButton 
                              color="primary" 
                              onClick={() => onEditHistoryItem(item)} 
                              title="Edytuj sesję produkcyjną"
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton 
                              color="error" 
                              onClick={() => onDeleteHistoryItem(item)} 
                              title="Usuń sesję produkcyjną"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                  {/* Summary row */}
                  <TableRow sx={{ '& td': { fontWeight: 'bold', bgcolor: 'rgba(0, 0, 0, 0.04)' } }}>
                    <TableCell colSpan={2} align="right">Suma:</TableCell>
                    <TableCell>{enrichedProductionHistory.reduce((sum, item) => sum + (item.timeSpent || 0), 0)} min</TableCell>
                    <TableCell>
                      {formatQuantityPrecision(
                        enrichedProductionHistory.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0), 
                        3
                      )} {task.unit}
                    </TableCell>
                    {selectedMachineId && (
                      <>
                        <TableCell>
                          {enrichedProductionHistory.reduce((sum, item) => sum + (item.machineData?.okProduced || 0), 0)}
                        </TableCell>
                        <TableCell>
                          {enrichedProductionHistory.reduce((sum, item) => sum + (item.machineData?.nokProduced || 0), 0)}
                        </TableCell>
                        <TableCell>
                          {enrichedProductionHistory.reduce((sum, item) => sum + (item.machineData?.totalProduced || 0), 0)}
                        </TableCell>
                      </>
                    )}
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Grid>

      {/* Sekcja planu mieszań (checklista) - ulepszona wersja */}
      {task?.mixingPlanChecklist && task.mixingPlanChecklist.length > 0 && (
        <Grid item xs={12}>
          <EnhancedMixingPlan
            task={task}
            isMobile={isMobile}
            isVerySmall={isVerySmall}
            onChecklistItemUpdate={onChecklistItemUpdate}
            externalIngredientLinks={ingredientReservationLinks}
            onPlanUpdate={async () => {
              // ✅ POPRAWKA: Odśwież dane zadania po aktualizacji planu mieszań
              // Zapobiega cofaniu się zmian przez starą wersję danych w propie task
              if (fetchAllTaskData) {
                console.log('🔄 Odświeżanie danych zadania po aktualizacji planu mieszań...');
                await fetchAllTaskData();
              }
            }}
          />
        </Grid>
      )}
    </Grid>
  );
};

export default memo(ProductionPlanTab); 