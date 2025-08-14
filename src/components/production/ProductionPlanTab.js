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
  Checkbox
} from '@mui/material';
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
  onChecklistItemUpdate
}) => {
  const { t } = useTranslation('taskDetails');

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
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>{t('productionHistory.title')}</Typography>
          
          {/* Selektor maszyny i przycisk dodawania */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControl size="small" sx={{ minWidth: 200 }}>
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
              
              {selectedMachineId && (
                <Chip 
                  size="small" 
                  label={`Wyświetlanie danych z ${availableMachines.find(m => m.id === selectedMachineId)?.name || selectedMachineId}`}
                  color="info"
                  variant="outlined"
                />
              )}
            </Box>
            
            <Button 
              variant="contained" 
              color="primary" 
              startIcon={<AddIcon />} 
              onClick={handleAddHistoryClick}
              size="small"
            >
              {t('productionHistory.addRecord')}
            </Button>
          </Box>

          {productionHistory.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Brak historii produkcji dla tego zadania
            </Typography>
          ) : (
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

      {/* Sekcja planu mieszań (checklista) - kompaktowa wersja */}
      {task?.mixingPlanChecklist && task.mixingPlanChecklist.length > 0 && (
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">{t('mixingPlan.title')}</Typography>
            </Box>
            
            {task.mixingPlanChecklist.filter(item => item.type === 'header').map(headerItem => {
              const ingredients = task.mixingPlanChecklist.filter(item => item.parentId === headerItem.id && item.type === 'ingredient');
              const checkItems = task.mixingPlanChecklist.filter(item => item.parentId === headerItem.id && item.type === 'check');
              
              return (
                <Box key={headerItem.id} sx={{ mb: 2, border: '1px solid #e0e0e0', borderRadius: 1, p: 1.5 }}>
                  {/* Nagłówek mieszania */}
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      {headerItem.text}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {headerItem.details}
                    </Typography>
                  </Box>
                  
                  <Grid container spacing={2}>
                    {/* Składniki - kompaktowe wyświetlanie */}
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 1 }}>
                        Składniki:
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {ingredients.map((ingredient) => (
                          <Box key={ingredient.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                              {ingredient.text}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                              {ingredient.details}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Grid>
                    
                    {/* Status - kompaktowe checkboxy */}
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 1 }}>
                        Status wykonania:
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {checkItems.map((item) => (
                          <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <FormControlLabel 
                              control={
                                <Checkbox 
                                  checked={item.completed || false}
                                  size="small"
                                  onChange={(e) => onChecklistItemUpdate(item.id, e.target.checked)}
                                />
                              } 
                              label={
                                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                                  {item.text}
                                </Typography>
                              }
                              sx={{ margin: 0, '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
                            />
                            {item.completed && (
                              <Chip 
                                size="small" 
                                label={item.completedAt ? new Date(item.completedAt).toLocaleDateString('pl-PL') : '-'} 
                                color="success" 
                                variant="outlined" 
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            )}
                          </Box>
                        ))}
                      </Box>
                    </Grid>
                  </Grid>
                </Box>
              );
            })}
          </Paper>
        </Grid>
      )}
    </Grid>
  );
};

export default memo(ProductionPlanTab); 